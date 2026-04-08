fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("../../packages/proto/homegame.proto")?;
    Ok(())
}
